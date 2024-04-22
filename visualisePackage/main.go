package main

import (
	"flag"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"
	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
)


type sfdxProject struct {
	PackageDirectories []packageDirectory `json:"packageDirectories"`
}

type packageDirectory struct {
	Path      string    `json:"path"`
	Package   string    `json:"package"`
	Size      int       `json:"size"`
	Domain    string    `json:"domain"`
	When      time.Time `json:"when"`
	FileCount int       `json:"fileCount"`
}

func main() {
	repoPath := flag.String("repo", "", "Path to the git repository")
	domainPath := flag.String("domain", "domain.json", "Path to the domain file")

  

	flag.Parse()

	// Pring the flag value
	fmt.Println("repo:", *repoPath)
	fmt.Println("domain:", *domainPath)


	if *repoPath == "" {
		log.Fatal("Repository path is required")
	}

	if err := run(*repoPath, *domainPath); err != nil {
		log.Fatalf("%s", err)
	}
 
	if err := run(*repoPath, *domainPath); err != nil {
		log.Fatalf("%s", err)
	}
 
}

func run(repoPath, domainPath string) error {
	domains, err := loadDomains(domainPath)
	if err != nil {
		return fmt.Errorf("could not load domains: %s", err)
	}

	iter, err := getLogIterator(repoPath)
	if err != nil {
		return err
	}
	defer iter.Close()

	var pp [][]packageDirectory

	index := 0

	for {
		if index > 6000 {
			break
		}

		commit, err := iter.Next()
		if err != nil {
			break
		}

		pDirs, err := getInfo(commit)
		if err != nil {
			continue
		}

		files, err := getFilesInCommit(commit)
		if err != nil {
			continue
		}

		for i := range pDirs {
			if pDirs[i].Package == "" {
				pDirs[i].Package = pDirs[i].Path
			}

			pDirs[i].Size = len(pDirs[i].Package)
			pDirs[i].Domain = domains[pDirs[i].Package]
			pDirs[i].When = commit.Author.When
			pDirs[i].FileCount = countFilesInPath(files, pDirs[i].Path)
		}

		pp = append(pp, pDirs)

		index++
	}

	

	outputFile, err := os.Create("data.js")
    if err != nil {
        return fmt.Errorf("could not create output file: %s", err)
    }
    defer outputFile.Close()

    _, err = outputFile.WriteString("const dataJson = ")
    if err != nil {
        return fmt.Errorf("could not write to output file: %s", err)
    }

    encoder := json.NewEncoder(outputFile)
    encoder.SetIndent("", "  ")
    return encoder.Encode(pp)

}

func loadDomains(path string) (map[string]string, error) {
	var domains map[string]string

	f, err := os.Open(path)
	if err != nil {
		return domains, err
	}
	defer f.Close()

	err = json.NewDecoder(f).Decode(&domains)

	return domains, err
}

func getFilesInCommit(c *object.Commit) ([]string, error) {
	var files []string

	fileIter, err := c.Files()
	if err != nil {
		return files, err
	}
	defer fileIter.Close()

	err = fileIter.ForEach(func(f *object.File) error {
		files = append(files, f.Name)
		return nil
	})

	return files, err
}

func countFilesInPath(files []string, path string) int {
	count := 0

	for _, fname := range files {
		if strings.HasPrefix(fname, path) {
			count++
		}
	}

	return count
}

func parsefdxProjectJSON(f *object.File) ([]packageDirectory, error) {
	r, err := f.Reader()
	if err != nil {
		return nil, fmt.Errorf("could not open file: %s", err)
	}

	var p sfdxProject
	if err := json.NewDecoder(r).Decode(&p); err != nil {
		return nil, err
	}

	return p.PackageDirectories, nil
}

func getLogIterator(dir string) (object.CommitIter, error) {
	repo, err := git.PlainOpen(dir)
	if err != nil {
		return nil, fmt.Errorf("could not open git repo: %s", err)
	}

	ref, err := repo.Head()
	if err != nil {
		return nil, fmt.Errorf("could not get HEAD ref: %s", err)
	}

	fname := "sfdx-project.json"

	iter, err := repo.Log(&git.LogOptions{
		From:     ref.Hash(),
		Order:    git.LogOrderCommitterTime,
		FileName: &fname,
	})
	if err != nil {
		return nil, fmt.Errorf("could not get log iterator: %s", err)
	}

	return iter, nil
}

func getInfo(c *object.Commit) ([]packageDirectory, error) {
	t, err := c.Tree()
	if err != nil {
		return nil, fmt.Errorf("could not get tree of commit: %s", err)
	}

	f, err := t.File("sfdx-project.json")
	if err != nil {
		return nil, err
	}

	return parsefdxProjectJSON(f)
}
